package com.futebol;

import net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;

/** Catálogo e envio das animações de corpo. As animações em si são desenhadas no cliente (ClientAnims). */
public final class Anim {
    private Anim() {}

    public static final int CHUTE = 1, CARRINHO = 2, CABECEIO = 3, BRACOS = 4, PUNHO = 5, AVIAO = 6, DANCA = 7, CARTAO = 8, LAMENTO = 9,
        ARREMESSO = 10, MERGULHO = 11, FINTA = 12, GESTO = 14, PEDALADA = 15, APLAUSO = 18, PROTESTO = 19, OUVIDO = 20, PASSE = 21, LANCAMENTO = 22, JOELHO = 23, ROBO = 24, BERCO = 25, FRIO = 26, ARCO = 27, SHUSH = 28, SAMBA = 29, SURFE = 30, ABERTO = 31, SIUU = 32, MEDITAR = 33, CORACAO = 34;

    public static void play(ServerLevel level, Entity e, int anim, int dur) {
        if (e == null) return;
        AnimPayload p = new AnimPayload(e.getId(), anim, dur);
        for (ServerPlayer pl : level.players()) if (ServerPlayNetworking.canSend(pl, AnimPayload.TYPE)) ServerPlayNetworking.send(pl, p);
    }
}
