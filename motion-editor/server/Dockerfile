FROM node:22-alpine
WORKDIR /app
COPY server ./server
ENV DATA_DIR=/data PORT=8787
VOLUME /data
EXPOSE 8787
CMD ["node", "server/index.mjs"]
