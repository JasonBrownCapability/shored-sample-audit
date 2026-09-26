// Drafts a friendly class description for the studio owner.
// Called from the "Write it for me" button on the sessions page.

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

export async function draftSessionDescription(input: {
  title: string;
  durationMin: number;
  level: string;
}): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You write short, warm descriptions for pottery classes at small independent studios. Two sentences, British English, no exclamation marks.",
        },
        {
          role: "user",
          content: `Class: ${input.title}. Length: ${input.durationMin} minutes. Level: ${input.level}.`,
        },
      ],
      max_tokens: 120,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}
