const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export interface HealthResponse {
  status: string;
  app_name: string;
  version: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function getHealth(): Promise<HealthResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/api/health`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    throw new ApiError(
      "Cannot connect to the NetSonic backend. Check that the API is running.",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      `Backend returned HTTP ${response.status}.`,
      response.status,
    );
  }

  try {
    return (await response.json()) as HealthResponse;
  } catch {
    throw new ApiError("The backend returned an invalid response.");
  }
}