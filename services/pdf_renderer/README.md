# PDF Renderer Service

This service is a dedicated Cloud Run instance to render PDFs from JSON data using Python scripts from the `transparenciabr` repository. It solves the limitations of the `shell_exec` environment.

## Deployment

1.  Clone the `transparenciabr` repository and navigate to the root directory.
2.  Ensure you are authenticated with gcloud (`gcloud auth login`) and the correct project is set (`gcloud config set project projeto-codex-br`).
3.  Run the deployment script from the **root of the repository**:
    ```bash
    bash services/pdf_renderer/deploy.sh
    ```

The script will build the Docker image, push it to GCR, and deploy it to Cloud Run. It will output the service URL upon completion.

## API Usage

Once deployed, you can trigger a PDF generation by sending a `POST` request to the `/render` endpoint of the service. You will need to make this endpoint callable from the Maestro agent, which may require an `http_request` tool or a similar capability.

**Endpoint:** `[SERVICE_URL]/render`

**Method:** `POST`

**Headers:**
```json
{
  "Content-Type": "application/json"
}
```

**Body (JSON):**
```json
{
  "script_path": "scripts/pararraia/gerar_pdf.py",
  "data_json_path": "scripts/pararraia/dossie_data.json",
  "output_filename": "dossie_pararraia_v1.pdf"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "gcs_path": "gs://transparenciabr-dossies/generated/dossie_pararraia_v1.pdf"
}
```

**Error Response (4xx/5xx):**
```json
{
  "error": "Error message here.",
  "stdout": "...",
  "stderr": "..."
}
```
