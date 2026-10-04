import { APICallError } from "ai"
import { AppError } from "../domain/model"
/** Never expose provider bodies, document text or credentials in public errors. */
export function aiError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (APICallError.isInstance(error)) {
    let code = ""
    try {
      code = JSON.parse(error.responseBody ?? "{}").error?.code ?? ""
    } catch {
      /* Not every provider response is JSON. */
    }
    if (error.statusCode === 401 || code === "invalid_api_key")
      return new AppError(
        502,
        "OpenAI rejected the saved API key. Replace it in Settings → Document intelligence, then retry analysis."
      )
    if (code === "insufficient_quota")
      return new AppError(
        502,
        "Your OpenAI quota is exhausted. Check your OpenAI account credits and billing."
      )
    if (error.statusCode === 403 || error.statusCode === 404)
      return new AppError(
        502,
        "This OpenAI model is unavailable with this key. Check the model and permissions in settings."
      )
    if (error.statusCode === 400)
      return new AppError(
        502,
        "OpenAI cannot analyze this document with the selected model. Check the format and choose a compatible model in settings."
      )
    if (error.statusCode === 429 || (error.statusCode ?? 0) >= 500)
      return new AppError(
        503,
        "OpenAI is temporarily unavailable. A retry will be attempted.",
        true
      )
  }
  return new AppError(
    502,
    "AI analysis failed. Check your connection and selected model, then try again.",
    true
  )
}
