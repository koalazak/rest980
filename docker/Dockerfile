# Use latest node
FROM node:boron

MAINTAINER koalazak <zak.tux@gmail.com>

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install rest980
RUN apt-get update
RUN apt-get install -y git
RUN git clone https://github.com/koalazak/rest980.git ./
RUN npm install


ENV BLID ''
ENV PASSWORD ''
ENV ROBOT_IP ''

ENV PORT 3000

EXPOSE ${PORT}

# Start the REST interface!
CMD [ "npm", "start" ]
