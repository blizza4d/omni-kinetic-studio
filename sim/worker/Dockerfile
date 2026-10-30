# Omni-Kinetic Headless Robotics Simulation Worker Image
# Runs headless physics simulation and RL rollouts on Nebius Serverless AI Jobs
FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    libgl1-mesa-glx \
    libosmesa6-dev \
    libglew-dev \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .

ENTRYPOINT ["python3", "-m", "sim.worker.main"]
