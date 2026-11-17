package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"strings"
	"testing"
)

// O token precisa carregar os pontos iniciais e a assinatura precisa bater (formato r||s, o do navegador e do servidor).
func TestTokenComPontos(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	pts := int64(250)
	tok, err := makeToken(key, "ABCD000000000001", "Maria", 30, &pts)
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.Split(tok, ".")
	raw, _ := base64.RawURLEncoding.DecodeString(parts[0])
	var p payload
	if err := json.Unmarshal(raw, &p); err != nil {
		t.Fatal(err)
	}
	if p.P == nil || *p.P != 250 || p.D != "ABCD000000000001" || p.E == 0 {
		t.Fatalf("payload inesperado: %+v", p)
	}
	sig, _ := base64.RawURLEncoding.DecodeString(parts[1])
	h := sha256.Sum256([]byte(parts[0]))
	if !ecdsa.Verify(&key.PublicKey, h[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])) {
		t.Fatal("assinatura não confere")
	}
}

func TestTokenSemPontosNaoTemOCampo(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	tok, _ := makeToken(key, "ABCD000000000001", "Sem pontos", 0, nil)
	raw, _ := base64.RawURLEncoding.DecodeString(strings.Split(tok, ".")[0])
	if strings.Contains(string(raw), `"p"`) {
		t.Fatalf("token antigo não deve ter o campo p: %s", raw)
	}
}
