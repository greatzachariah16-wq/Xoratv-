FROM golang:1.18-alpine AS build
RUN apk add --no-cache git ca-certificates
ENV CGO_ENABLED=0
RUN go install github.com/libp2p/hydra-booster@master

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=build /go/bin/hydra-booster /hydra-booster
EXPOSE 7779
ENTRYPOINT ["/hydra-booster"]
CMD ["-nheads=150", "-name=source-lab-dht", "-httpapi-addr=0.0.0.0:7779", "-db=/data", "-ui-theme=none"]
