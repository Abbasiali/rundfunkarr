// Re-export the newznab handler at /api/newznab/api for Sonarr/Radarr compatibility
// Sonarr appends /api to the base URL automatically

export { GET } from "../route";
