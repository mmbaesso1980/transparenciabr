
import os
import subprocess
from flask import Flask, request, jsonify
from google.cloud import storage

app = Flask(__name__)

@app.route('/render', methods=['POST'])
def render_pdf():
    data = request.get_json()
    if not data or 'data_json_path' not in data or 'output_filename' not in data or 'script_path' not in data:
        return jsonify({'error': 'Missing parameters: script_path, data_json_path, and output_filename are required.'}), 400

    data_json_path = data['data_json_path']
    output_filename = data['output_filename']
    script_to_run = data['script_path']
    output_tmp_path = f"/tmp/{output_filename}"

    # Security check: only allow scripts from the 'scripts/' directory
    if not script_to_run.startswith('scripts/'):
        return jsonify({'error': 'Invalid script path. Must be in the scripts/ directory.'}), 403

    cmd = [
        "python3",
        script_to_run,
        "--findings",
        data_json_path,
        "--output",
        output_tmp_path
    ]

    try:
        # Execute the PDF generation script
        subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=120)

        # Upload the result to GCS
        storage_client = storage.Client()
        bucket_name = os.environ.get("GCS_BUCKET", "transparenciabr-dossies")
        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(f"generated/{output_filename}")
        
        blob.upload_from_filename(output_tmp_path)
        
        # Clean up the local file
        os.remove(output_tmp_path)

        return jsonify({
            'success': True,
            'gcs_path': f"gs://{bucket_name}/generated/{output_filename}"
        }), 200

    except subprocess.CalledProcessError as e:
        return jsonify({
            'error': 'PDF generation script failed.',
            'stdout': e.stdout,
            'stderr': e.stderr
        }), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))
