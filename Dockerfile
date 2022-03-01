FROM node:14

ARG DOPPLER_TOKEN=${DOPPLER_TOKEN}
ARG PORT=${PORT :: 5000}

WORKDIR /home/backend

COPY . .

RUN (curl -Ls https://cli.doppler.com/install.sh || wget -qO- https://cli.doppler.com/install.sh) | sh

RUN npm install 

EXPOSE $PORT

CMD ["doppler", "run", "--", "npm", "start"]
