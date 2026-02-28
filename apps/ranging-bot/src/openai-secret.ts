import { Resource } from "sst";

export function getOpenAiApiKey(): string {
  let linkedValue: string | undefined;

  try {
    const resources = Resource as unknown as Record<
      string,
      { value?: string } | undefined
    >;
    linkedValue = resources.OpenAiApiKey?.value;
  } catch {
    linkedValue = undefined;
  }

  const apiKey =
    typeof linkedValue === "string" && linkedValue.trim().length > 0
      ? linkedValue.trim()
      : typeof process.env.OPENAI_API_KEY === "string" &&
          process.env.OPENAI_API_KEY.trim().length > 0
        ? process.env.OPENAI_API_KEY.trim()
        : undefined;

  if (!apiKey) {
    throw new Error(
      "Missing linked Resource.OpenAiApiKey or OPENAI_API_KEY fallback",
    );
  }

  return apiKey;
}
