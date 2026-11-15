package com.futebol;

import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;

/** Servidor -> cliente: controla a gravação do clipe do gol. cmd: 0 parar, 1 gravar (ligado), 2 gol (marca o instante), 3 clipe pronto (texto = título). */
public record ClipPayload(int cmd, String text) implements CustomPacketPayload {
    public static final CustomPacketPayload.Type<ClipPayload> TYPE = new CustomPacketPayload.Type<>(Identifier.fromNamespaceAndPath("futebol", "clip"));
    public static final StreamCodec<RegistryFriendlyByteBuf, ClipPayload> CODEC = StreamCodec.composite(
        ByteBufCodecs.VAR_INT, ClipPayload::cmd, ByteBufCodecs.STRING_UTF8, ClipPayload::text, ClipPayload::new);

    @Override public CustomPacketPayload.Type<? extends CustomPacketPayload> type() { return TYPE; }

    public static void send(net.minecraft.server.level.ServerLevel level, int cmd, String text) {
        ClipPayload p = new ClipPayload(cmd, text);
        for (net.minecraft.server.level.ServerPlayer pl : level.players())
            if (net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking.canSend(pl, TYPE)) net.fabricmc.fabric.api.networking.v1.ServerPlayNetworking.send(pl, p);
    }
}
