# AWS Emulator for macOS and Windows (Linux and CI install the .deb/.rpm directly).
# AWS publishes no image, so this is the Dockerfile from the AWS Emulator user guide with the
# package pinned. Build through `pnpm aws:up`, which passes the version from ./VERSION.
FROM public.ecr.aws/amazonlinux/amazonlinux:2023-minimal
ARG EMULATOR_VERSION
ARG EMULATOR_ARCH=x86_64
ADD https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/aws-emulator-${EMULATOR_VERSION}-1-${EMULATOR_ARCH}.rpm /tmp/aws-emulator.rpm
RUN rpm -i /tmp/aws-emulator.rpm && rm /tmp/aws-emulator.rpm \
    && mkdir -p /home/emulator && chown 1000 /home/emulator
USER 1000
ENV HOME=/home/emulator EMULATOR_BIND_ADDRESS=0.0.0.0
ENTRYPOINT ["aws-emulator"]
