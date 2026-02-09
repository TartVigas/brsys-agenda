// /js/nav.js — Bottom Nav active (V1.1)
// Regras:
// - Home -> /app.html (ou "/")
// - Reservas -> /reservas.html
// - Mapa -> /mapa.html
// - Config -> /config.html (e fallback pra /conta.html antigo)
(function () {
  const path = (window.location.pathname || "").toLowerCase();

  let key = "home";

  // prioridade: match exato/semântico
  if (path.includes("reservas")) key = "reservas";
  else if (path.includes("mapa")) key = "mapa";
  else if (path.includes("config")) key = "config";
  else if (path.includes("conta")) key = "config"; // fallback legado
  else if (path.includes("hoje")) key = "hoje";    // se você ainda usar no menu
  else if (path.includes("app") || path === "/" || path.endsWith("/index.html")) key = "home";

  document.querySelectorAll(".bn-item").forEach((a) => {
    const k = (a.getAttribute("data-nav") || "").toLowerCase();
    a.classList.toggle("active", k === key);
  });
})();
