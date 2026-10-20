# Coach AMAVIE — image de production
FROM node:20-alpine
WORKDIR /app
# Aucune dépendance npm : on copie simplement le code
COPY package.json server.js ./
COPY public ./public
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_FILE=/data/data.json
# Dossier des données (base, photos, sauvegardes) : montez un disque persistant sur /data
RUN mkdir -p /data
EXPOSE 3000
CMD ["node", "server.js"]
