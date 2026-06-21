import type { FastifyInstance } from "fastify";

export async function oauthRoutes(app: FastifyInstance) {
  app.get("/api/v1/auth/oauth/google", async (_req, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return reply.status(503).send({
        error: "Google OAuth not configured",
        hint: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
      });
    }
    const redirect = `${process.env.API_PUBLIC_URL ?? "http://localhost:3001"}/api/v1/auth/oauth/google/callback`;
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=openid%20email%20profile`;
    return reply.redirect(url);
  });

  app.get("/api/v1/auth/oauth/github", async (_req, reply) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return reply.status(503).send({
        error: "GitHub OAuth not configured",
        hint: "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET",
      });
    }
    const redirect = `${process.env.API_PUBLIC_URL ?? "http://localhost:3001"}/api/v1/auth/oauth/github/callback`;
    const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&scope=user:email`;
    return reply.redirect(url);
  });

  app.get("/api/v1/auth/oauth/:provider/callback", async (req, reply) => {
    return reply.status(501).send({
      error: "OAuth callback handler pending provider token exchange",
      provider: (req.params as { provider: string }).provider,
    });
  });
}
