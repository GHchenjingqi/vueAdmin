#!/bin/bash
J="content-type: application/json"
B=http://localhost:3010
echo "=== FINAL E2E (真实链路全程) ==="
curl -s -m 15 -c /tmp/ff.txt -X POST $B/api/cart/items -H "$J" -d '{"skuId":142,"qty":2}' -o /dev/null -w "1.cart:%{http_code}\n"
O=$(curl -s -m 20 -b /tmp/ff.txt -X POST $B/api/checkout/orders -H "$J" -d '{"email":"final@test.com","address":{"fullName":"Final E2E","phone":"10086","country":"US","province":"CA","city":"LA","address1":"9 Main","postcode":"90001"},"idempotencyKey":"final-001"}')
OID=$(echo "$O" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
OACC=$(echo "$O" | grep -o '"accessToken":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "2.order:$OID"
curl -s -m 30 -X POST "$B/api/checkout/orders/$OID/pay?t=$OACC" -H "$J" -o /dev/null -w "3.pay:%{http_code}\n"
sleep 1
curl -s -m 15 "$B/api/orders/$OID?t=$OACC" | grep -o '"status":"[^"]*"\|"paymentStatus":"[^"]*"' | tr '\n' ' '; echo
curl -s -m 15 -o /dev/null -w "4.wrong-token:%{http_code}\n" "$B/api/orders/$OID?t=BAD"
curl -s -m 15 "$B/checkout/result?id=$OID&t=$OACC" -o /tmp/final.html -w "5.result-page:%{http_code}\n"
grep -oE "Order SO[0-9]+" /tmp/final.html | head -1
echo "6.Paid-on-page:$(grep -c 'Paid' /tmp/final.html)"
O2=$(curl -s -m 20 -b /tmp/ff.txt -X POST $B/api/checkout/orders -H "$J" -d '{"email":"final@test.com","address":{"fullName":"Final E2E","phone":"10086","country":"US","province":"CA","city":"LA","address1":"9 Main","postcode":"90001"},"idempotencyKey":"final-001"}')
OID2=$(echo "$O2" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
if [ "$OID" = "$OID2" ]; then echo "7.idempotent-replay: same($OID)"; else echo "7.idempotent-replay: DIFF $OID vs $OID2"; fi
