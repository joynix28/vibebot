// Configuration du bot — tout passe par les variables d'environnement.
// Copiez .env.example vers .env et remplissez les valeurs.

const config = {
  token: process.env.TOKEN ?? "",
  owner: process.env.OWNER_ID ?? "",
  clientId: process.env.CLIENT_ID ?? "",
  clientSecret: process.env.CLIENT_SECRET ?? "",
  redirectUri: process.env.REDIRECT_URI ?? "http://localhost:3000/callback",
  baseUrl: (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  dashboardPort: Number(process.env.DASHBOARD_PORT ?? 3000),
  dashboardEnabled: (process.env.DASHBOARD_ENABLED ?? "true") === "true",
};

export default config;
