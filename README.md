# Cadre

Cadre is an on-premise AI Coding Assistant CLI designed to provide a seamless, secure, and offline-capable coding experience. It connects to OpenAI-compatible APIs (like locally hosted vLLM instances) to bring powerful AI assistance directly to your terminal without relying on external cloud services.

## Why "Cadre"?

The name **Cadre** refers to a small group of people specially trained for a particular purpose or profession. In the context of this project, it represents a specialized unit of AI agents working in concert to assist you. Just as a cadre forms the core of an organization's capability, this tool acts as your dedicated, intelligent support team for software development.

## Installation

```bash
npm install
npm run build
npm link
```

## Usage

Start an interactive session:

```bash
cadre start
```

Configure the connection (e.g., for a local vLLM instance):

```bash
cadre config --url http://localhost:8000/v1 --model meta-llama/Meta-Llama-3-8B-Instruct --key sk-fake-key
```

Reset configuration:

```bash
cadre reset
```