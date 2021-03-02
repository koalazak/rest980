#!/bin/bash

# Script variables
DOCKER="sudo docker"
D_BUILD="$DOCKER build"
D_CONT="$DOCKER container"
D_CREATE="$DOCKER create"

# Configuration part
PORT=""
BLID=""
PASSWORD=""
ROBOT_IP=""

RET_VAL=""
read_if_empty()
{
	if [ -z "${!1}" ] ; then
		echo "Insert values for $1"
		read
		RET_VAL="${REPLY}"
		return
	fi

	RET_VAL="${!1}"
}
read_if_empty PORT
PORT=$RET_VAL
read_if_empty BLID
BLID=$RET_VAL
read_if_empty PASSWORD
PASSWORD=$RET_VAL
read_if_empty ROBOT_IP
ROBOT_IP=$RET_VAL

# Docker environment
CONT_NAME=rest980
IMAGE_NAME=koalazak/rest980/local

exists () {
        $1 ls -a | grep "$2"
}

$D_BUILD . -t $IMAGE_NAME
$D_CREATE \
	--name=$CONT_NAME \
	-p $PORT:3000 \
	-e BLID=$BLID \
	-e PASSWORD=$PASSWORD \
	-e ROBOT_IP=$ROBOT_IP \
	--restart always \
	$IMAGE_NAME

exists "$D_CONT" $CONT_NAME
if [ 0 -eq $? ] ; then
        echo "Creating container named: $CONT_NAME succeed."
        $D_CONT start $CONT_NAME
else
        echo "Failed to create container."
fi

