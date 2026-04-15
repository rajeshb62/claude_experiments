"""
Local MusicGen server — runs facebook/musicgen-small on your machine.
Uses a job queue so long generations don't drop HTTP connections.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
import scipy.io.wavfile
import numpy as np
import base64
import io
import uuid
import threading
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Loading MusicGen model (this may take a minute on first run)...")
from transformers import pipeline

device = "cuda" if torch.cuda.is_available() else "cpu"
synthesiser = pipeline(
    "text-to-audio",
    model="facebook/musicgen-small",
    device=device,
)
print(f"Model loaded on {device}. Server ready at http://localhost:8000")

# Job store: { jobId: { status: "pending"|"done"|"error", audioUrl, error } }
jobs: dict = {}
jobs_lock = threading.Lock()


class GenerateRequest(BaseModel):
    prompt: str
    duration: int = 10


def run_generation(job_id: str, prompt: str, duration: int):
    try:
        max_tokens = duration * 50
        result = synthesiser(
            prompt,
            forward_params={"do_sample": True, "max_new_tokens": max_tokens},
        )

        audio = result["audio"]
        rate = result["sampling_rate"]

        if isinstance(audio, np.ndarray):
            if audio.ndim == 2:
                audio = audio[0]
        else:
            audio = np.array(audio)
            if audio.ndim == 2:
                audio = audio[0]

        audio = (audio / np.max(np.abs(audio)) * 32767).astype(np.int16)

        buf = io.BytesIO()
        scipy.io.wavfile.write(buf, rate, audio)
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode("utf-8")
        audio_url = f"data:audio/wav;base64,{b64}"

        with jobs_lock:
            jobs[job_id] = {"status": "done", "audioUrl": audio_url}

    except Exception as e:
        with jobs_lock:
            jobs[job_id] = {"status": "error", "error": str(e)}


@app.post("/generate")
def generate(req: GenerateRequest):
    job_id = str(uuid.uuid4())
    with jobs_lock:
        jobs[job_id] = {"status": "pending"}

    thread = threading.Thread(
        target=run_generation,
        args=(job_id, req.prompt, req.duration),
        daemon=True,
    )
    thread.start()
    print(f"[{job_id[:8]}] Started generation: '{req.prompt[:60]}' ({req.duration}s)")
    return {"jobId": job_id}


@app.get("/status/{job_id}")
def status(job_id: str):
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
