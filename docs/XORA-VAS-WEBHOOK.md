# XoraTV VAS billing callback

This is XoraTV's provider-neutral internal callback contract. It is **not** a claim that a carrier or VAS aggregator is connected. The provider adapter must translate the provider's verified callback into this shape after the commercial and technical integration is agreed.

## Endpoint

- Method: `POST`
- Path: `/api/webhooks/vas`
- Authentication header: `X-Xora-VAS-Secret: <server-configured-secret>`
- Content type: `application/json`

Both `XORA_VAS_WEBHOOK_SECRET` and `XORA_VAS_CREATOR_COMMISSION_BPS` must be configured on the server before successful-payment events can create commissions. The commission rate has no default; it must match the agreed commercial contract.

## Normalized payload

```json
{
  "eventId": "provider-unique-event-id",
  "eventType": "payment.succeeded",
  "userId": "xoratv-user-id",
  "subscriptionId": "provider-subscription-id",
  "amount": 100,
  "currency": "NGN",
  "provider": "vas-provider",
  "occurredAt": "2026-11-15T12:00:00.000Z"
}
```

Supported events are `payment.succeeded`, `payment.reversed` and `subscription.cancelled`.

The `userId` must be the XoraTV account already associated with the carrier subscription. Phone-number matching is intentionally not guessed in this provider-neutral layer.

## Commission and release rules

- Clicks, signups and free-data claims do not earn new referral commissions.
- A commission is calculated from the first verified successful subscription payment using the configured `XORA_VAS_CREATOR_COMMISSION_BPS` share.
- One commission is recorded per referred XoraTV member; provider event IDs are idempotent.
- New commissions stay pending for seven days from the verified payment time. A cancellation or reversal in that hold period reverses the pending commission. After the hold, it remains eligible.
- Existing referral claims, payout requests, bank details, referral tokens, and CPA promotion records are preserved. Historical Special Prize records are not deleted.

The partner-specific callback signature, field mapping, subscription-to-user identity mapping, billing schedule, and commission basis must be connected from the VAS partner's actual integration specification.
