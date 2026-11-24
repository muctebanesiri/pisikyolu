"""Run one local model and write {"seconds", "result"} JSON. Everything else lives in pipeline.ts."""
import argparse
import dataclasses
import json
import time


def whisper(args):
    import mlx_whisper
    started = time.perf_counter()
    return mlx_whisper.transcribe(args.audio, path_or_hf_repo=args.model, language='en', word_timestamps=True,
        temperature=0, condition_on_previous_text=False, verbose=None if args.excerpt else False), started


def diarize(args):
    from mlx_audio.vad import load
    started = time.perf_counter()
    model = load(args.model)
    if not args.stream:
        segments = []
        for i, result in enumerate(model.generate_stream(args.audio, chunk_duration=5, threshold=.5, min_duration=.08, merge_gap=.08)):
            segments.extend(dataclasses.asdict(s) for s in result.segments)
            if i % 40 == 0:
                print(f'Diarized approximately {i*5}s', flush=True)
        return segments, started
    import numpy as np
    import wave
    state = model.init_streaming_state()
    proc = model._processor_config
    frame_seconds = proc.hop_length * model.config.fc_encoder_config.subsampling_factor / proc.sampling_rate
    chunks, samples = [], 0
    with wave.open(args.audio, 'rb') as source:
        while data := source.readframes(16000*5):
            chunk = np.frombuffer(data, dtype='<i2').astype(np.float32)/32768
            model_offset = state.frames_processed * frame_seconds
            result, state = model.feed(chunk, state, sample_rate=16000, threshold=.5, min_duration=.08, merge_gap=.08)
            chunks.append({'model_offset': model_offset, 'audio_offset': samples/16000, 'duration': len(chunk)/16000,
                           'segments': [dataclasses.asdict(s) for s in result.segments]})
            samples += len(chunk)
            if samples % (16000*200) == 0:
                print(f'Diarized {samples/16000:g}s', flush=True)
    return chunks, started


def crosscheck(args):
    import moondream
    model = moondream.photon(args.model, device=args.device)
    started = time.perf_counter()
    return model.transcribe(audio=args.audio, timestamps='word'), started


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['whisper', 'diarize', 'crosscheck'])
    parser.add_argument('audio')
    parser.add_argument('output')
    parser.add_argument('--model', required=True)
    parser.add_argument('--device', default='cpu')
    parser.add_argument('--stream', action='store_true')
    parser.add_argument('--excerpt', action='store_true')
    args = parser.parse_args()
    result, started = {'whisper': whisper, 'diarize': diarize, 'crosscheck': crosscheck}[args.command](args)
    with open(args.output, 'w') as file:
        json.dump({'seconds': time.perf_counter() - started, 'result': result}, file)


if __name__ == '__main__':
    main()
