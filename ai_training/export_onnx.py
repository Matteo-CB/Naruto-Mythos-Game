"""
Export du modèle PyTorch vers le format ONNX pour utilisation dans Node.js.

Utilisation:
  python export_onnx.py --checkpoint ../public/models/naruto_ai_best.pth --output ../public/models/naruto_ai.onnx

Le fichier .onnx est ensuite chargé par NeuralEvaluator.ts via onnxruntime-node.
"""

import argparse
import json
from pathlib import Path

import torch
import onnx
import onnxruntime as ort
import numpy as np

from model import NarutoValueNet, NarutoValueNetLarge, FEATURE_DIM


def export(args):
    print(f"Chargement du checkpoint: {args.checkpoint}")

    checkpoint = torch.load(args.checkpoint, map_location='cpu', weights_only=True)
    model_state = checkpoint['model_state']

    # Detect model size from first layer
    first_layer_shape = model_state.get('fc1.weight', model_state.get('trunk.0.weight', None))
    if first_layer_shape is not None and first_layer_shape.shape[0] == 1024:
        model = NarutoValueNetLarge(input_dim=FEATURE_DIM)
        print("Modèle détecté: LARGE (1024 hidden)")
    else:
        model = NarutoValueNet(input_dim=FEATURE_DIM)
        print("Modèle détecté: Standard (512 hidden)")

    model.load_state_dict(model_state)
    model.eval()

    print(f"Paramètres: {sum(p.numel() for p in model.parameters()):,}")

    # Test forward pass
    dummy_input = torch.randn(1, FEATURE_DIM)
    with torch.no_grad():
        test_output = model(dummy_input)
    print(f"Test forward pass: {dummy_input.shape} → {test_output.shape} = {test_output.item():.4f}")

    # Export to ONNX
    output_path = args.output
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    print(f"\nExport ONNX vers: {output_path}")

    dummy_batch = torch.randn(1, FEATURE_DIM)

    torch.onnx.export(
        model,
        dummy_batch,
        output_path,
        export_params=True,
        opset_version=17,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={
            'input': {0: 'batch_size'},    # variable batch size
            'output': {0: 'batch_size'},
        },
        verbose=False,
    )

    print("Export terminé!")

    # Verify ONNX model
    print("\nVérification du modèle ONNX...")
    onnx_model = onnx.load(output_path)
    onnx.checker.check_model(onnx_model)
    print("Modèle ONNX valide!")

    # Test with onnxruntime
    print("\nTest avec ONNX Runtime...")
    session = ort.InferenceSession(output_path)
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name

    print(f"  Entrée:  '{input_name}' shape={session.get_inputs()[0].shape}")
    print(f"  Sortie:  '{output_name}' shape={session.get_outputs()[0].shape}")

    # Batch test
    test_batch = np.random.randn(8, FEATURE_DIM).astype(np.float32)
    results = session.run([output_name], {input_name: test_batch})[0]
    print(f"  Batch test (8 samples): {results.flatten()[:5].tolist()} ...")
    print(f"  Plage: [{results.min():.4f}, {results.max():.4f}]")

    # File size
    size_mb = Path(output_path).stat().st_size / 1e6
    print(f"\nFichier ONNX: {output_path} ({size_mb:.1f} MB)")

    # Save metadata
    meta_path = str(output_path).replace('.onnx', '_meta.json')
    metadata = {
        'feature_dim': FEATURE_DIM,
        'input_name': input_name,
        'output_name': output_name,
        'epoch': checkpoint.get('epoch', 'unknown'),
        'val_auc': checkpoint.get('val_auc', 'unknown'),
        'val_loss': checkpoint.get('val_loss', 'unknown'),
    }
    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    print(f"Métadonnées: {meta_path}")

    print("\n" + "=" * 50)
    print("Prochaine étape:")
    print("  Le fichier .onnx est dans public/models/naruto_ai.onnx")
    print("  Le serveur le chargera automatiquement au démarrage.")
    print("  Assurez-vous d'avoir installé: npm install onnxruntime-node")
    print("=" * 50)


def parse_args():
    parser = argparse.ArgumentParser(description='Export ONNX du modèle Naruto AI')
    parser.add_argument(
        '--checkpoint',
        default='../public/models/naruto_ai_best.pth',
        help='Checkpoint PyTorch à exporter'
    )
    parser.add_argument(
        '--output',
        default='../public/models/naruto_ai.onnx',
        help='Chemin de sortie .onnx'
    )
    return parser.parse_args()


if __name__ == '__main__':
    args = parse_args()
    export(args)
