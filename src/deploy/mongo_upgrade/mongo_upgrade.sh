#!/bin/bash

if [ -d /tmp/test/ ]; then
  COMMON_FUNCS_PATH="/tmp/test/"
else
  COMMON_FUNCS_PATH="/root/node_modules"
fi

. ${COMMON_FUNCS_PATH}/noobaa-core/src/deploy/NVA_build/deploy_base.sh
. ${COMMON_FUNCS_PATH}noobaa-core/src/deploy/NVA_build/common_funcs.sh

while [[ $# -gt 1 ]]; do
    key="$1"
    case $key in
        ---param_secret)
            param_secret="$2"
            shift
            ;;
        --param_bcrypt_secret)
            param_bcrypt_secret="$2"
            shift
            ;;
        --param_ip)
            param_ip="$2"
            shift
            ;;
        --param_client_subject)
            param_client_subject="$2"
            shift
            ;;
        *)
            # unknown option
        ;;
    esac
    shift # past argument or value
done

#Ordered Array of scripts to run
UPGRADE_SCRIPTS=('./mongo_upgrade_15.js' )

upgrade_failed=0
for script in "${UPGRADE_SCRIPTS[@]}"; do 
    deploy_log "Running Mongo Upgrade Script ${script}"
    ${MONGO_SHELL} --eval "var param_secret='${sec}', param_bcrypt_secret='${bcrypt_sec}', param_ip='${ip}', param_client_subject='${client_subject}'" ${CORE_DIR}/src/deploy/mongo_upgrade/mongo_upgrade.js
    rc=$?
    if [ $rc -ne 0 ]; then
        upgrade_failed=1
        deploy_log "Failed Mongo Upgrade Script ${script}"
    fi
done

exit $upgrade_failed