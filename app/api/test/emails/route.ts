import { listTestEmails } from "../../../lib/test-email-sink";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (process.env.E2E_TEST !== "1") {
    return Response.json({ error: "Not found" }, { status: 404, headers: noStore });
  }

  const to = new URL(request.url).searchParams.get("to");
  if (!to) {
    return Response.json({ error: "Missing recipient" }, { status: 400, headers: noStore });
  }

  return Response.json({ messages: listTestEmails(to) }, { headers: noStore });
}
