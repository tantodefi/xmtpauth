# XMTP Agent Earnings Queries

## GraphQL Endpoint
```
https://xmtp-indexer.onrender.com/graphql
```

## Get All Payments (ETH + USDC)
```graphql
query GetAllPayments {
  ethTransfers(
    where: { isPayment: { _eq: true } }
    orderBy: [{ timestamp: desc }]
  ) {
    id
    blockNumber
    timestamp
    from
    to
    value
    tokenType
    status
    transactionHash
  }
}
```

## Get Total Earnings by Token
```graphql
query GetTotalEarnings {
  ethTransfers(
    where: { isPayment: { _eq: true } }
  ) {
    tokenType
    value
  }
}
```

## Get Recent Payments (Last 24 hours)
```graphql
query GetRecentPayments($since: DateTime!) {
  ethTransfers(
    where: { 
      isPayment: { _eq: true }
      timestamp: { _gte: $since }
    }
    orderBy: [{ timestamp: desc }]
  ) {
    id
    timestamp
    from
    value
    tokenType
    transactionHash
  }
}
```

## Get Payments from Specific Address
```graphql
query GetPaymentsFromAddress($address: String!) {
  ethTransfers(
    where: { 
      isPayment: { _eq: true }
      from: { _eq: $address }
    }
    orderBy: [{ timestamp: desc }]
  ) {
    id
    timestamp
    value
    tokenType
    transactionHash
  }
}
```

## Usage Examples

### Calculate Total ETH Earnings
```javascript
const ethPayments = data.ethTransfers.filter(t => t.tokenType === 'ETH');
const totalEth = ethPayments.reduce((sum, payment) => sum + Number(payment.value), 0) / 1e18;
console.log(`Total ETH earnings: ${totalEth} ETH`);
```

### Calculate Total USDC Earnings
```javascript
const usdcPayments = data.ethTransfers.filter(t => t.tokenType === 'USDC');
const totalUsdc = usdcPayments.reduce((sum, payment) => sum + Number(payment.value), 0) / 1e6;
console.log(`Total USDC earnings: ${totalUsdc} USDC`);
```
