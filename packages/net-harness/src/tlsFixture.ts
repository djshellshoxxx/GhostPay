/**
 * Self-signed TLS fixture for loopback tests ONLY. The key below was generated for this repo's
 * tests, protects nothing, and is valid for the fake names rpc.example.test, relay.example.test and
 * gateway.example.test. Never trust this certificate outside tests.
 *
 * @security test-only; do not import from production code.
 */
export const TEST_TLS_HOSTNAMES = ['rpc.example.test', 'relay.example.test', 'gateway.example.test'] as const;

/** Test-only certificate (PEM). */
export const TEST_TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIB1jCCAXygAwIBAgIUOwK140k/OlV3LaRqtl0jP6cIHc4wCgYIKoZIzj0EAwIw
GzEZMBcGA1UEAwwQcnBjLmV4YW1wbGUudGVzdDAgFw0yNjEwMjExNjM1MjVaGA8y
MTI2MDkyNzE2MzUyNVowGzEZMBcGA1UEAwwQcnBjLmV4YW1wbGUudGVzdDBZMBMG
ByqGSM49AgEGCCqGSM49AwEHA0IABOMkXut2irGmVzTkFH1UUUpn4S6SoQSyCcqU
wvxGcb7Nyl+PL3C8vVdD6ik8C5ZJBYQzN20vrptzMcFAlgB1Nt6jgZswgZgwHQYD
VR0OBBYEFFtKXtRRL8p38eO++Al3z/Wj5VQ6MB8GA1UdIwQYMBaAFFtKXtRRL8p3
8eO++Al3z/Wj5VQ6MA8GA1UdEwEB/wQFMAMBAf8wRQYDVR0RBD4wPIIQcnBjLmV4
YW1wbGUudGVzdIIScmVsYXkuZXhhbXBsZS50ZXN0ghRnYXRld2F5LmV4YW1wbGUu
dGVzdDAKBggqhkjOPQQDAgNIADBFAiBwZn585l4tt0XTllzF9uHR90Q2Dvp+qS+0
NvHN4DjcnAIhAL0xD7XfnJyNG1xx8rTZevteigXnpSzWpRyqoRj27/zh
-----END CERTIFICATE-----
`;

/** Test-only private key (PEM). Not a secret. */
export const TEST_TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg2/l6tc6IRwtdDS4l
pHzyGGClJbTY8od2uUnMsY6XX/OhRANCAATjJF7rdoqxplc05BR9VFFKZ+EukqEE
sgnKlML8RnG+zcpfjy9wvL1XQ+opPAuWSQWEMzdtL66bczHBQJYAdTbe
-----END PRIVATE KEY-----
`;
