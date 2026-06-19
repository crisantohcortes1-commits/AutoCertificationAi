import { NextRequest, NextResponse } from "next/server";

const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

function normalizeNames(inputText: string): string {
  const parts: string[] = inputText.split(/\r?\n/);
  return parts
    .map((line: string) => {
      // Remove leading numbers, dots, parentheses: "1. ", "1) ", "1: " etc
      let cleaned = line.replace(/^\d+[\.\)\:\-\s]+/g, "").trim();
      // Remove trailing numbers with underscore: "jane_1" -> "jane"
      cleaned = cleaned.replace(/_\d+$/g, "").trim();
      // Remove ALL special chars and numbers except spaces
      cleaned = cleaned.replace(/[0-9•·◦\-\[\](){}.,;:!?@#$%^&*_]/g, "").trim();
      // Remove extra spaces
      cleaned = cleaned.replace(/\s+/g, " ").trim();
      // Proper case
      cleaned = cleaned
        .toLowerCase()
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
      return cleaned;
    })
    .filter((item: string) => Boolean(item) && item.length > 2)
    .sort()
    .join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const inputText = typeof body?.input === "string" ? body.input : "";

    if (!inputText.trim()) {
      return NextResponse.json({ cleanedText: "" }, { status: 200 });
    }

    const apiKey = process.env.NVIDIA_API_KEY;

    if (apiKey) {
      try {
        const response = await fetch(NVIDIA_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "nvidia/llama-3.1-nemotron-70b-instruct",
            messages: [
              {
                role: "system",
                content: `You are a name-cleaning assistant for certificates. Your job is to clean messy name lists.
RULES - FOLLOW EXACTLY:
1. SMART EXTRACTION: Identify and separate distinct human names even if clustered in a single line or sentence. Strip out academic courses (e.g., bsit-1b, BSEE-2), titles/degrees (e.g., Dr., PHD), and alphanumeric noise. Treat each discovered name as a separate entity.
2. REMOVE numbers from the START: "1. Jane" -> "Jane", "1) John" -> "John"
3. REMOVE numbers from the END with underscore: "Jane_1" -> "Jane", "John_5" -> "John"
4. REMOVE all special characters: dots, dashes, brackets, underscores, etc (except spaces)
5. REMOVE extra spaces - only single space between words
6. CAPITALIZE CORRECTLY: First letter of each word uppercase, rest lowercase
   Example: "jANE SMITh" -> "Jane Smith"
7. SORT names alphabetically (A to Z)
8. ONE NAME PER LINE in output
9. NO extra text, NO numbering, NO explanation

EXAMPLES:
Input: "jANE SMITh\\n1. Brass Albecury\\n1. JAne Doe"
Output: "Brass Albecury\\nJane Doe\\nJane Smith"

Input: "john_1\\nmary_2\\n1. alice smith"
Output: "Alice Smith\\nJohn\\nMary"

Input: "1) robert - johnson_7\\n2) maria garcía"
Output: "Maria Garcia\\nRobert Johnson"

Input: "1. _xX_lawrence cortes bsit-1b. James Dawson!!! Mary Grace Piatos_99\\nDr. albert WESKER_5 math-101 // 2) john Doe BSEE-2\\nmaria_clara PHD... 3. zack fair cloud strife"
Output: "Albert Wesker\\nCloud Strife\\nJames Dawson\\nJohn Doe\\nLawrence Cortes\\nMaria Clara\\nMary Grace Piatos\\nZack Fair"`,
              },
              {
                role: "user",
                content: inputText,
              },
            ],
            temperature: 0.1,
            max_tokens: 1000,
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const aiText = data.choices?.[0]?.message?.content?.trim();
          if (aiText) {
            return NextResponse.json({
              cleanedText: aiText,
              source: "nvidia",
            });
          }
        }
      } catch (error) {
        console.error("NVIDIA API error:", error);
      }
    }

    // Fallback to local normalization
    return NextResponse.json({
      cleanedText: normalizeNames(inputText),
      source: "local-fallback",
    });
  } catch (error) {
    console.error("Route error:", error);
    return NextResponse.json({ cleanedText: "" }, { status: 500 });
  }
}