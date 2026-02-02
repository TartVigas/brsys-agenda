import { requireAuth } from "./auth.js";
import { loadHotelContext, renderHotelBadge } from "./state.js";

const user = await requireAuth();
const ctx = await loadHotelContext();

if (!ctx) {
  // não tem hotel criado ainda -> manda pro cadastro
  window.location.replace("/cadastro.html");
}

renderHotelBadge(ctx);

