# Use latest node
FROM node:boron

MAINTAINER koalazak <zak.tux@gmail.com>

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Set the node env (we only need production dependencies in the deployed image)
ENV NODE_ENV production

# Install dependencies (we deliberately just copy packages.json so we can use the cache if no package.json changes are made)
COPY package.json /usr/src/app/
RUN npm install

# Copy the sources
COPY . /usr/src/app

# Set default env
ENV BLID=
ENV PASSWORD=
ENV ROBOT_IP=
ENV FIRMWARE_VERSION=
ENV ENABLE_LOCAL=
ENV ENABLE_CLOUD=
ENV KEEP_ALIVE=
ENV SSL_KEY_FILE=
ENV SSL_CERT_FILE=
ENV PORT=3000

EXPOSE ${PORT}

# Start the REST interface!
CMD [ "npm", "start" ]