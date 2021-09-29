FROM node:14

WORKDIR /home/backend

COPY . .

RUN (curl -Ls https://cli.doppler.com/install.sh || wget -qO- https://cli.doppler.com/install.sh) | sh

RUN npm install 

EXPOSE $PORT

CMD ["doppler", "run", "--", "npm", "start"]
