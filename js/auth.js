import { supabase } from "./supabase.js";

const { data: { session } } = await supabase.auth.getSession();

if (!session) {
  // não logado → volta pro login
  window.location.href = "/login.html";
}

// logout
const btnLogout = document.getElementById("logout");
if (btnLogout) {
  btnLogout.onclick = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login.html";
  };
}

