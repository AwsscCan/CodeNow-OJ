import { getRuntimeAuth } from "../../lib/auth";
import { createUserReader } from "../../lib/current-user";

export async function GET(request: Request) {
  const auth = await getRuntimeAuth(request);
  const reader = createUserReader(async (headers) => {
    const session = await auth.api.getSession({ headers });
    if (!session) return null;
    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
    };
  });
  const user = await reader.optional(request.headers);

  return Response.json(
    { user },
    { headers: { "Cache-Control": "no-store" } },
  );
}
