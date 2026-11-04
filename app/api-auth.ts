// Guards API routes. Sites hosting injects `oai-authenticated-user-id` for signed-in
// users and forwards `OAI-Sites-Authorization` for the local Capital Runner.
// Local dev (localhost) has neither, so it is allowed.
export function unauthorized(request: Request): Response | null {
  const { hostname } = new URL(request.url);
  if (hostname === "localhost" || hostname === "127.0.0.1") return null;
  if (request.headers.get("oai-authenticated-user-id")) return null;
  if (request.headers.get("oai-sites-authorization")) return null;
  return Response.json({ error: "Sign in to use Capital." }, { status: 401 });
}
