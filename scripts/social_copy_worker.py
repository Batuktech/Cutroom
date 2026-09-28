import argparse
import json
import os
import threading
from pathlib import Path
from suggest_worker import resources, watchdog


def generate(args):
    from llama_cpp import Llama, LlamaGrammar
    ram, gpu = resources()
    if ram < 3072 or gpu < 3840:
        raise ValueError('Local copy generation needs 3 GB available RAM and 3.8 GB free GPU memory.')
    data = json.loads(Path(args.input).read_text())
    stopped = threading.Event()
    threading.Thread(target=watchdog, args=(stopped,), daemon=True).start()
    model = None
    try:
        os.nice(10)
        model = Llama(model_path=args.model, n_gpu_layers=24, n_ctx=2048, n_batch=128, n_ubatch=64,
                      n_threads=2, n_threads_batch=2, use_mmap=True, flash_attn=True, verbose=False)
        prompt = '<|im_start|>system\n' + data['instruction'] + ' /no_think<|im_end|>\n<|im_start|>user\n' + data['input'] + '<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n'
        if len(model.tokenize(prompt.encode(), add_bos=False)) + 700 > 2048:
            raise ValueError('This clip exceeds the local context limit. Shorten it or choose a cloud provider.')
        result = model(prompt, max_tokens=700, temperature=.2, seed=42, stop=['<|im_end|>'],
                       grammar=LlamaGrammar.from_json_schema(json.dumps(data['schema']), verbose=False))
        if result['choices'][0]['finish_reason'] == 'length':
            raise ValueError('Qwen could not finish the social copy. Try a shorter clip or edit the copy manually.')
        Path(args.output).write_text(json.dumps(json.loads(result['choices'][0]['text'])))
    finally:
        if model is not None:
            model.close()
        stopped.set()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    try:
        generate(parser.parse_args())
    except Exception:
        import sys
        print('Local social copy generation failed. Check Qwen memory availability and use a shorter clip or a cloud provider.', file=sys.stderr)
        sys.exit(1)
