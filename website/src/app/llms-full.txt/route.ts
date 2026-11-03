import { buildLlms, llmsResponse } from "@/lib/llms";

/** /llms.txt plus every product (price, part number, key specs) as one file, for assistants that read a whole site. */
export async function GET() {
  return llmsResponse(await buildLlms(true));
}

export const revalidate = 600;
