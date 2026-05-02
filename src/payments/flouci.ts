const FLOUCI_API = "https://developers.flouci.com/api/v2";

function authHeader(): string {
  const pub = process.env.FLOUCI_PUBLIC_KEY;
  const priv = process.env.FLOUCI_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("FLOUCI_PUBLIC_KEY / FLOUCI_PRIVATE_KEY missing");
  return `Bearer ${pub}:${priv}`;
}

export async function flouciGeneratePayment(opts: {
  amountMillimes: number;
  developerTrackingId: string;
  successLink: string;
  failLink: string;
  webhookUrl: string;
  clientLabel: string;
}): Promise<{ paymentId: string; link: string }> {
  const res = await fetch(`${FLOUCI_API}/generate_payment`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: String(opts.amountMillimes),
      developer_tracking_id: opts.developerTrackingId,
      accept_card: true,
      success_link: opts.successLink,
      fail_link: opts.failLink,
      webhook: opts.webhookUrl,
      client_id: opts.clientLabel.slice(0, 120),
    }),
  });
  const data = (await res.json()) as {
    result?: { payment_id?: string; link?: string; message?: string };
    message?: string;
  };
  const pid = data.result?.payment_id;
  const link = data.result?.link;
  if (!res.ok || !pid || !link) {
    throw new Error(
      data.result?.message ?? data.message ?? `Flouci generate_payment failed (${res.status})`
    );
  }
  return { paymentId: pid, link };
}

export async function flouciVerifyPayment(paymentId: string): Promise<{
  ok: boolean;
  status?: string;
  developerTrackingId?: string;
  amountMillimes?: number;
}> {
  const res = await fetch(
    `${FLOUCI_API}/verify_payment/${encodeURIComponent(paymentId)}`,
    { headers: { Authorization: authHeader() } }
  );
  const data = (await res.json()) as {
    success?: boolean;
    result?: {
      status?: string;
      developer_tracking_id?: string;
      amount?: number;
    };
  };
  if (!data.success || !data.result) {
    return { ok: false, status: data.result?.status };
  }
  const status = data.result.status;
  const amount = data.result.amount;
  return {
    ok: status === "SUCCESS",
    status,
    developerTrackingId: data.result.developer_tracking_id,
    amountMillimes: typeof amount === "number" ? amount : undefined,
  };
}
