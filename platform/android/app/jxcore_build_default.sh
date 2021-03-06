#!/bin/bash

NORMAL_COLOR='\033[0m'
RED_COLOR='\033[0;31m'
GREEN_COLOR='\033[0;32m'
GRAY_COLOR='\033[0;37m'

LOG() {
    COLOR="$1"
    TEXT="$2"
    echo -e "${COLOR}$TEXT ${NORMAL_COLOR}"
}

cp jni/Android.mk.default jni/Android.mk

if [ $# -eq 1 ]
then
  rm -rf jxcore-binaries/
  mkdir jxcore-binaries/
  cp -R $1/* jxcore-binaries/
  rm jxcore-binaries/*_mipsel.a
	rm jxcore-binaries/*_x64.a	
else
  LOG $RED_COLOR "You should provide the path for JXcore Android binaries"
  exit
fi

ndk-build

#rm -rf jxcore-binaries/
#rm -rf obj/
