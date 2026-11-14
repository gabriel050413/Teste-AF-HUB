package com.futebol;

import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;

/** Servidor -> cliente: toca uma animação de corpo (chute, carrinho, comemoração...) numa entidade. */
public record AnimPayload(int id, int anim, int dur) implements CustomPacketPayload {
    public static final CustomPacketPayload.Type<AnimPayload> TYPE = new CustomPacketPayload.Type<>(Identifier.fromNamespaceAndPath("futebol", "anim"));
    public static final StreamCodec<net.minecraft.network.RegistryFriendlyByteBuf, AnimPayload> CODEC = StreamCodec.composite(
        ByteBufCodecs.VAR_INT, AnimPayload::id, ByteBufCodecs.VAR_INT, AnimPayload::anim, ByteBufCodecs.VAR_INT, AnimPayload::dur, AnimPayload::new);

    @Override public CustomPacketPayload.Type<? extends CustomPacketPayload> type() { return TYPE; }
}
