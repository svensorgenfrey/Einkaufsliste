FROM node:24-alpine
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --chown=node:node server/server.mjs server/api.mjs ./server/
COPY --chown=node:node index.html style.css app.js ./
USER node
EXPOSE 8080
CMD ["node", "server/server.mjs"]
