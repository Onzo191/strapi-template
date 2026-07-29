# Container-image Lambda: ClamAV engine + signature DB + the Node handler.
#
# A zip package cannot work here — the signature database alone is ~250 MB, past
# the unzipped zip limit. The image also lets `freshclam` run at build time, so a
# cold start does not begin with a signature download.
#
# Rebuild + redeploy nightly to refresh signatures (see index.mjs).
FROM public.ecr.aws/lambda/nodejs:22

# clamd + freshclam. `--setopt=install_weak_deps=False` keeps the image lean.
RUN dnf install -y --setopt=install_weak_deps=False clamav clamav-update shadow-utils \
    && dnf clean all \
    && rm -rf /var/cache/dnf

# Signature DB baked into the image at build time.
RUN mkdir -p /var/lib/clamav \
    && freshclam --datadir=/var/lib/clamav --quiet \
    && chmod -R a+rX /var/lib/clamav

# clamd listens on TCP so the handler can reach it over 127.0.0.1. Lambda's
# filesystem is read-only apart from /tmp, so the socket path stays off-disk.
RUN printf '%s\n' \
    'TCPSocket 3310' \
    'TCPAddr 127.0.0.1' \
    'DatabaseDirectory /var/lib/clamav' \
    'MaxScanSize 200M' \
    'MaxFileSize 100M' \
    'StreamMaxLength 100M' \
    'LogSyslog no' \
    'Foreground yes' \
    > /etc/clamd.d/scan.conf

COPY package.json ./
RUN npm install --omit=dev

COPY index.mjs entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Starts clamd, waits for it to answer PING, then hands over to the Lambda
# runtime. Doing this in the entrypoint (not per-invocation) means the signature
# load cost is paid once per cold start, not once per object.
ENTRYPOINT ["/var/task/entrypoint.sh"]
CMD ["index.handler"]
