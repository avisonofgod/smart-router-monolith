## instalacion alpine linux
- setup-alpine
## openssh
apk add openssh nano
rc-update add sshd
nano /etc/ssh/sshd_config
#PermitrRootLogin yes
service sshd restart

