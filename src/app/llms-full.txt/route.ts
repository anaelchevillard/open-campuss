import { llmsFullText } from "@/lib/llms";
import { llmsResponse } from "@/lib/llms-route";

// Lu à chaque requête : BASE_URL et Campuss IA sont ceux du serveur, pas ceux de la construction
export const dynamic = "force-dynamic";

export function GET() {
  return llmsResponse(llmsFullText);
}
