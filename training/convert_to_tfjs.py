"""
convert_to_tfjs.py — Convert a trained Keras model (.h5 or .keras) into the
TensorFlow.js layers-model format (model.json + weight shard .bin files) that
`frontend/src/services/modelService.ts` loads at runtime.

Usage:
    python convert_to_tfjs.py --input artifacts/handwriting_model.h5 \
        --output ../frontend/public/models/handwriting-model
"""
import argparse
import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent


def _patch_numpy_deprecated_aliases():
    """tensorflowjs<4 imports np.object/np.bool, removed in NumPy>=1.24/2.0.

    This restores those aliases for the duration of the process only (no
    packages are modified) so the pinned tensorflowjs converter still works
    against a modern numpy. Safe to remove once tensorflowjs>=4.17 (which
    drops the old aliases) is installed.
    """
    import numpy as np
    for name, value in (('object', object), ('bool', bool), ('float', float), ('int', int)):
        if not hasattr(np, name):
            setattr(np, name, value)


def _stub_optional_tfjs_dependency():
    """tensorflowjs>=4.x unconditionally imports tensorflow_decision_forests
    at package-init time (for its SavedModel-conversion CLI path), even
    though converting a plain Keras model (what this script does) never
    touches that code. tensorflow_decision_forests pins an older TensorFlow
    than this project uses and isn't otherwise needed here, so we stub the
    module out rather than require installing a conflicting TF version.
    """
    import sys
    import types

    if 'tensorflow_decision_forests' not in sys.modules:
        try:
            import tensorflow_decision_forests  # noqa: F401 - use the real thing if it's actually installed
        except ImportError:
            sys.modules['tensorflow_decision_forests'] = types.ModuleType('tensorflow_decision_forests')


def _normalize_keras3_config_for_tfjs(node):
    """Rewrite Keras-3-flavored layer config keys into the Keras-2-shaped
    JSON the @tensorflow/tfjs *JavaScript* runtime's deserializer expects.

    The Python `tensorflowjs` converter (as of 4.x) happily converts a
    Keras 3 model and reports success, but it does not translate the
    model_config JSON itself -- it still contains Keras 3 shapes such as
    InputLayer's "batch_shape" (Keras 2 used "batch_input_shape") and a
    per-layer "dtype" that's a nested {"class_name": "DTypePolicy", ...}
    object instead of a plain string. Loading such a model.json with
    tf.loadLayersModel() in the browser throws
    "An InputLayer should be passed either a batchInputShape or an
    inputShape" before ever reaching user code. Recursively walk the config
    tree and fix both up so the JS runtime can actually deserialize it.
    """
    if isinstance(node, dict):
        if node.get('class_name') == 'InputLayer' and 'config' in node:
            cfg = node['config']
            if 'batch_shape' in cfg and 'batch_input_shape' not in cfg:
                cfg['batch_input_shape'] = cfg.pop('batch_shape')

        if (
            isinstance(node.get('dtype'), dict)
            and node['dtype'].get('class_name') == 'DTypePolicy'
        ):
            node['dtype'] = node['dtype'].get('config', {}).get('name', 'float32')

        for value in node.values():
            _normalize_keras3_config_for_tfjs(value)
    elif isinstance(node, list):
        for item in node:
            _normalize_keras3_config_for_tfjs(item)


def main():
    _patch_numpy_deprecated_aliases()
    _stub_optional_tfjs_dependency()
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--input', default=str(SCRIPT_DIR / 'artifacts' / 'handwriting_model.h5'))
    p.add_argument('--output', default=str(SCRIPT_DIR.parent / 'frontend' / 'public' / 'models' / 'handwriting-model'))
    args = p.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        raise FileNotFoundError(
            f"Model not found at {input_path}. Train one first: python train_baseline.py"
        )

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # tensorflowjs_converter's Python API needs the Keras model loaded, not
    # just a file path. Loaded (and originally trained/saved) via tf_keras
    # rather than tf.keras -- see the comment at the top of
    # training/train_baseline.py for why (Keras 3's model_config JSON isn't
    # understood by the tfjs-layers JS deserializer).
    import tf_keras
    from tensorflowjs.converters import save_keras_model

    print(f"Loading {input_path} ...")
    model = tf_keras.models.load_model(input_path, compile=False)

    print(f"Converting to TensorFlow.js format at {output_dir} ...")
    save_keras_model(model, str(output_dir))

    model_json_path = output_dir / 'model.json'
    with open(model_json_path, 'r', encoding='utf-8') as f:
        model_json = json.load(f)
    _normalize_keras3_config_for_tfjs(model_json.get('modelTopology', {}))
    with open(model_json_path, 'w', encoding='utf-8') as f:
        json.dump(model_json, f)
    print(f"Normalized {model_json_path} for the tfjs-layers JS deserializer (Keras 3 -> Keras 2 config shape).")

    print("Done. Files written:")
    for f in sorted(output_dir.iterdir()):
        print(f"  {f.name} ({f.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
