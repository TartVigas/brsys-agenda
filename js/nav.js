// js/nav.js
(function () {
  const path = (window.location.pathname || "").toLowerCase();

  let key = "home";
  if (path.includes("reservas")) key = "reservas";
  else if (path.includes("hoje")) key = "hoje";
  else if (path.includes("conta")) key = "conta";
  else if (path.includes("app")) key = "home";

  document.querySelectorAll(".bn-item").forEach(a => {
    const k = a.getAttribute("data-nav");
    if (k === key) a.classList.add("active");
  });
})();
