// Envío del aviso de reposición vía Resend. Sin SDK: un fetch a su API HTTP
// (CLAUDE.md). La clave se lee de env.RESEND_API_KEY, un secret.

const FROM = "Avisos Zara <onboarding@resend.dev>";

export async function sendRestockEmail({ to, name, size, url }, env) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: `¡Disponible! ${name} (talla ${size})`,
      text: `${name} (talla ${size}) ya está disponible de nuevo.\n\n${url}`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend respondió ${response.status}: ${body}`);
  }
}
