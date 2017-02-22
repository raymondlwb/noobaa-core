CORE_DIR="/root/node_modules/noobaa-core"

if [ ! -d /etc/mongo_ssl/ ]; then
  mkdir /etc/mongo_ssl/
  . ${CORE_DIR}/src/deploy/NVA_build/setup_mongo_ssl.sh
  chmod 400 -R /etc/mongo_ssl
  local client_subject=`openssl x509 -in /etc/mongo_ssl/client.pem -inform PEM -subject -nameopt RFC2253 | grep subject | awk '{sub("subject= ",""); print}'`
  echo "MONGO_SSL_USER=${client_subject}" >> ${CORE_DIR}/.env
  # add bash script to run mongo shell with authentications
  echo "mongo --ssl --sslPEMKeyFile /etc/mongo_ssl/client.pem --sslCAFile /etc/mongo_ssl/root-ca.pem --sslAllowInvalidHostnames -u \"${client_subject}\" --authenticationMechanism MONGODB-X509 --authenticationDatabase \"\\\$external\" \"\$@\"" > /usr/bin/mongors
  chmod +x /usr/bin/mongors
fi