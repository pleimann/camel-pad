#pragma once

#include <cstdint>
#include <cstring>
#include "../config.h"

// Frame format:
//   [START_BYTE(0xAA)] [LEN_HI] [LEN_LO] [MSG_TYPE] [PAYLOAD...] [CHECKSUM]
//
// LEN = number of bytes in MSG_TYPE + PAYLOAD (excludes start, length, checksum)
// CHECKSUM = XOR of all bytes from MSG_TYPE through end of PAYLOAD

namespace protocol {

inline uint8_t checksum(const uint8_t* data, uint16_t len) {
    uint8_t cs = 0;
    for (uint16_t i = 0; i < len; i++) {
        cs ^= data[i];
    }
    return cs;
}

// Build a frame into buf. Returns total frame length.
// buf must be at least payloadLen + 5 bytes.
inline uint16_t buildFrame(uint8_t* buf, uint8_t msgType,
                           const uint8_t* payload, uint16_t payloadLen) {
    uint16_t bodyLen = 1 + payloadLen;  // msgType + payload
    buf[0] = FRAME_START_BYTE;
    buf[1] = (bodyLen >> 8) & 0xFF;
    buf[2] = bodyLen & 0xFF;
    buf[3] = msgType;
    if (payload && payloadLen > 0) {
        memcpy(buf + 4, payload, payloadLen);
    }
    buf[4 + payloadLen] = checksum(buf + 3, bodyLen);
    return 5 + payloadLen;
}

} // namespace protocol
