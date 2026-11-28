# Razorpay setup for theoneanother

The checkout code in TOA-Store and TOA-Admin already calls Razorpay. Only keys and server pieces are missing.

## Where the placeholders are
| What | Where | Placeholder |
|---|---|---|
| Key ID (public, safe in browser) | `checkout.js` line 32 in BOTH repos | `rzp_test_REPLACE_ME` |
| Key Secret (private) | Supabase secret | `RAZORPAY_KEY_SECRET` |
| Webhook secret (private) | Supabase secret | `RAZORPAY_WEBHOOK_SECRET` |

Never put the Key Secret in any .js/.html file or GitHub.

## Steps
1. Razorpay Dashboard > Test Mode > Account & Settings > API Keys > Generate. Copy Key ID and Key Secret.
2. Supabase SQL Editor: run `razorpay.sql`.
3. Install the CLI and link: `supabase login` then `supabase link --project-ref eymxrutbkbtglynynokb`
4. Set secrets (webhook secret: invent a long random string, reuse it in step 6):
   `supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=xxx RAZORPAY_WEBHOOK_SECRET=xxx`
5. Deploy:
   `supabase functions deploy create-razorpay-order`
   `supabase functions deploy verify-razorpay-payment`
   `supabase functions deploy razorpay-webhook --no-verify-jwt`
6. Razorpay Dashboard > Webhooks > Add: URL `https://eymxrutbkbtglynynokb.supabase.co/functions/v1/razorpay-webhook`, event `payment.captured`, secret = the string from step 4.
7. Paste the Key ID into `checkout.js` line 32 in both repos, commit, push.
8. Test with Razorpay test UPI/card, confirm an order appears in the admin with the Razorpay payment ID.
9. Go live: complete KYC, switch to Live keys, repeat steps 4, 6, 7 with `rzp_live_` values.

## Check before going live
`create_order` is an existing RPC whose SQL isn't in the repos. If it rejects calls without a logged-in admin (checks auth.uid), the verify function will fail and rows land in `razorpay_pending` with status `error`. Then either add a service-role bypass inside that function or tell me and I'll write a dedicated `create_paid_order` RPC.

## Automatic WhatsApp + email receipt (after payment)
Sent by the functions once an order is created. Receipt no. = order number, plus amount paid and payment ID.
Each channel is skipped if its secrets are missing, and a failed message never blocks an order.

Placeholders (Supabase secrets):
| Secret | Where to get it |
|---|---|
| `WHATSAPP_TOKEN` | Meta Business > System Users > generate permanent token (whatsapp_business_messaging) |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta developer app > WhatsApp > API Setup |
| `WHATSAPP_TEMPLATE_NAME` | default `order_confirmation` |
| `RESEND_API_KEY` | resend.com (free plan) |
| `MAIL_FROM` | e.g. `theoneanother <orders@yourdomain.com>` (domain verified in Resend) |

WhatsApp template to create in Meta (Category: Utility, Language: English), body exactly:
`Hi {{1}}, thank you for your order! Receipt no. {{2}}. Amount paid {{3}}. Payment ID {{4}}. We will update you when it ships. - theoneanother`

Set and redeploy:
`supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... RESEND_API_KEY=... MAIL_FROM="theoneanother <orders@yourdomain.com>"`
then redeploy verify-razorpay-payment and razorpay-webhook.
